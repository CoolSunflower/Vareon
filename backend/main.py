import sys
from pydantic import BaseModel
import modal

vareon_evo2_image = (
    # Start docker build from this base image
    modal.Image.from_registry(
        "nvcr.io/nvidia/pytorch:25.02-py3"
    )

    # Add necessary compilation libraries
    .apt_install(
        ["build-essential", "cmake", "ninja-build", "git", "gcc", "g++", "python3-pip"]
    )

    # Environment setup
    .env({
        "CC": "/usr/bin/gcc",
        "CXX": "/usr/bin/g++",
        "CUDA_PATH": "/usr/local/cuda",
        "CUDNN_PATH": "/usr/lib/x86_64-linux-gnu",
        "PATH": "/usr/local/cuda/bin:$PATH",
        "LD_LIBRARY_PATH": "/usr/local/cuda/lib64:$LD_LIBRARY_PATH",
    })

    # Install evo2 library
    .run_commands("pip install evo2")

    # Install other requirements
    .pip_install_from_requirements("requirements.txt")

    # Install transformer-engine for pytorch
    .run_commands([
        "pip install --upgrade pip setuptools wheel",
        "pip install packaging",
        "pip install transformer-engine[pytorch] --extra-index-url https://pypi.nvidia.com --no-build-isolation",
    ])

    # Install flash attention
    .run_commands("pip install flash-attn==2.8.0.post2")

    # Clone repo for BRCA analysis
    .run_commands("git clone https://github.com/arcinstitute/evo2")
)

app = modal.App("vareon-evo2-variant-analysis", image=vareon_evo2_image)

# To cache model data
volume = modal.Volume.from_name("hf_cache", create_if_missing=True)
mount_path = "/root/.cache/huggingface"

def getGenomeSequence(genome: str, chromosome: str, position, windowSize = 8192):
    halfWindow = windowSize//2
    startPosition = max(0, position - 1 - halfWindow)
    endPosition = position - 1 + halfWindow + 1
    print(f"Fetching: {windowSize}bp window around position {position} from UCSC API. {chromosome}: {startPosition} - {endPosition} ({genome})")
    
    import requests
    api_url = f"https://api.genome.ucsc.edu/getData/sequence?genome={genome};chrom={chromosome};start={startPosition};end={endPosition}"
    response = requests.get(api_url)

    if response.status_code != 200:
        raise Exception(f"Failed to fetch genome sequence from UCSC API: {response.status_code}")

    genome_data = response.json()
    if "dna" not in genome_data:
        error = genome_data.get("error", "Unknown Error")
        raise Exception(f"UCSC API Error: {error}")

    sequence = genome_data.get("dna", "").upper()

    if len(sequence) != (endPosition - startPosition):
        print(f"Warning: received sequence length ({len(sequence)}) different from expected ({endPosition - startPosition})")
    
    print(f"Loaded reference genome sequence window (length: {len(sequence)}bases)")

    return sequence, startPosition

def analyseVariant(model, sequence, reference, alternative, relativePositon):
    variantSequence = sequence[:relativePositon] + alternative + sequence[relativePositon+1:]
    
    referenceScore = model.score_sequences([sequence])[0]
    variantScore = model.score_sequences([variantSequence])[0]

    deltaScore = variantScore - referenceScore

    # Confidence Parameters:  {'threshold': -0.0009178519, 'lof_std': 0.0015140239, 'func_std': 0.0009016589} calculated over 500 BRCA SNV's
    threshold = -0.0009178519
    lofStd = 0.0015140239
    funcStd = 0.0009016589

    if deltaScore < threshold:
        prediction = 'Likely Pathogenic'
        confidence = min(abs(deltaScore-threshold)/lofStd, 1.0)
    else:
        prediction = 'Likely Benign'
        confidence = min(abs(deltaScore-threshold)/funcStd, 1.0)

    return {
        "reference": reference,
        "alternative": alternative,
        "delta_score": float(deltaScore),
        "prediction": prediction,
        "classification_confidence": float(confidence)
    }

class VariantRequest(BaseModel):
    variant_position: int
    alternative: str
    genome: str
    chromosome: str

@app.cls(gpu = "H100", volumes = {mount_path: volume}, max_containers = 3, retries = 2, scaledown_window = 60)
class Evo2Model:
    @modal.enter()
    def loadEvo2Model(self):
        from evo2 import Evo2
        print("Loading Evo2 model...")
        self.model = Evo2('evo2_7b')
        print("Evo2 model loaded")

    # @modal.method()
    @modal.fastapi_endpoint(method="POST")
    def analyseSingleMutation(self, request: VariantRequest):
        genome = request.genome
        chromosome = request.chromosome
        variantPosition = request.variant_position
        alternative = request.alternative

        WINDOW_SIZE = 8192
        print("Genome: ", genome)
        print("Chromosome: ", chromosome)
        print("Variant Position: ", variantPosition)
        print("Variant Alternative: ", alternative)

        sequence, sequenceStart = getGenomeSequence(genome = genome, chromosome = chromosome, position = variantPosition, windowSize = WINDOW_SIZE)
        print(f"Fetched genome sequence window at {sequenceStart}, first 100 bases: {sequence[:100]}")

        relativePosition = variantPosition - 1 - sequenceStart
        if relativePosition < 0 or relativePosition >= len(sequence):
            raise ValueError(f"Variant position {variantPosition} is outside the fetched window (start = {sequenceStart + 1}, end = {sequenceStart + len(sequence)})")

        reference = sequence[relativePosition]
        print("Reference is: ", reference)

        # Analyse Variant
        result = analyseVariant(model = self.model, sequence = sequence, reference = reference, alternative = alternative, relativePositon = relativePosition)
        result["position"] = variantPosition

        return result

@app.local_entrypoint()
def main():
    # Example of how you'd call the deployed Modal Function from your client
    import requests

    evo2Model = Evo2Model()
    url = evo2Model.analyseSingleMutation.web_url

    response = requests.post(url, json={"variant_position": 43119628, "alternative": "G", "genome": "hg38", "chromosome": "chr17"}, headers={"Content-Type": "application/json"})
    response.raise_for_status()

    result = response.json()
    print(result)
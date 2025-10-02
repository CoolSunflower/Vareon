# Vareon - Evo2 Variant Analysis Backend

A serverless Python backend for DNA variant effect prediction using the state-of-the-art Evo2 large language model. This backend provides GPU-accelerated pathogenicity scoring for single nucleotide variants (SNVs) deployed on Modal's H100 infrastructure.

## 🧬 Overview

This backend leverages the Evo2 foundation model to predict the functional impact of DNA mutations by:

- Fetching reference genome sequences from UCSC Genome Browser API
- Computing likelihood scores for reference and variant sequences
- Calculating delta scores to determine pathogenicity
- Providing scalable, serverless inference on H100 GPUs

## 🏗️ Architecture

The backend is built with:

- **Modal**: Serverless GPU deployment platform
- **Evo2**: 7B parameter foundation model for genomic sequence analysis
- **UCSC Genome API**: Reference genome sequence retrieval
- **PyTorch**: Deep learning framework with CUDA acceleration
- **BioPython**: Genomic data processing utilities

## 📁 Project Structure

```
backend/
├── main.py            # Main Modal app with variant analysis pipeline
├── brca.py            # BRCA1-specific analysis example
├── requirements.txt   # Python dependencies
├── evo2/              # Evo2 model repository (cloned during deployment)
└── README.md          # This file
```

## ⚙️ Setup & Installation

### Prerequisites

- Python 3.12+
- Modal account and CLI setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd backend
```

### 2. Create Virtual Environment

```bash
/usr/bin/python3.12 -m venv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Modal Setup

Install and configure Modal CLI:

```bash
pip install modal
modal setup
```

Follow the prompts to authenticate with your Modal account.

## 🚀 Testing & Deployment

### Local Testing

Test the pipeline locally:

```bash
modal run brca.py
```

This will:
1. Build the Docker image with all dependencies on your account
2. Load the Evo2 model on H100 GPU
3. Run a sample BRCA1 variant analysis
4. See saved graph for BRCA analysis

### Production Deployment

Deploy to Modal's serverless infrastructure:

```bash
modal deploy main.py
```

The app will be available at: `https://<your-username>--vareon-evo2-variant-analysis-<function-name>.modal.run`

## 📊 Core Functions

### `analyseSingleMutation`

Main endpoint for variant effect prediction.

**Parameters:**
- `genome` (str): Genome assembly (e.g., "hg38", "hg19")
- `chromosome` (str): Chromosome identifier (e.g., "chr17")
- `variantPosition` (int): 1-based genomic position
- `alternative` (str): Alternative nucleotide (A, T, G, C)

**Returns:**
- Pathogenicity score (delta likelihood)
- Reference and variant sequences
- Model confidence metrics

### `getGenomeSequence`

Fetches reference genome sequences from UCSC API.

**Parameters:**
- `genome` (str): Genome assembly
- `chromosome` (str): Chromosome
- `position` (int): Central position
- `windowSize` (int): Sequence window size (default: 8192bp)

**Returns:**
- Reference sequence string
- Sequence start position

## 🧪 Example Usage

### BRCA1 Variant Analysis

The `brca.py` file demonstrates comprehensive BRCA1 variant analysis:

```python
# Run BRCA1 pathogenicity analysis
modal run brca.py
```

This example:
1. Loads BRCA1 variant dataset from Findlay et al. (2018)
2. Processes 100 known variants
3. Computes Evo2 delta scores for zero-shot classification
4. Generates ROC analysis and visualization
5. Returns AUROC performance metrics

### Single Variant Prediction

```python
from main import Evo2Model

# Change analyseSingleVariant from modal.fastapi_endpoint to modal.method

@app.local_entrypoint()
def main():
    model = Evo2Model()
    result = model.analyseSingleMutation.remote(
        genome="hg38",
        chromosome="chr17", 
        variantPosition=43119628,
        alternative="G"
    )
```

## 🔧 Configuration

### Model Settings

- **Model**: `evo2_7b` (7 billion parameters)
- **Context Window**: 8,192 base pairs
- **GPU**: H100 (80GB VRAM)

### Container Configuration

The Modal container includes:

- **Base Image**: `nvcr.io/nvidia/pytorch:25.02-py3`
- **CUDA**: Full CUDA toolkit and cuDNN
- **Compilation Tools**: GCC, CMake, Ninja
- **Python Packages**: Evo2, Transformers, Flash Attention

### Environment Variables

```bash
CC=/usr/bin/gcc
CXX=/usr/bin/g++
CUDA_PATH=/usr/local/cuda
CUDNN_PATH=/usr/lib/x86_64-linux-gnu
```

## 📚 Dependencies

### Core Libraries

```
modal>=0.60.0          # Serverless deployment
torch>=2.0.0           # Deep learning framework  
transformers>=4.30.0   # Model loading utilities
flash-attn==2.8.0      # Optimized attention
transformer-engine     # NVIDIA optimization
```

### Analysis Libraries

```
biopython>=1.80        # Genomic sequence processing
pandas>=1.5.0          # Data manipulation
numpy>=1.24.0          # Numerical computing
requests>=2.28.0       # HTTP API calls
```

### Visualization (for examples)

```
matplotlib>=3.6.0      # Plotting
seaborn>=0.11.0        # Statistical visualization  
scikit-learn>=1.2.0    # ML metrics
```

## 🚨 Error Handling

### Common Issues

**Model Loading Errors**
```python
# Ensure sufficient GPU memory
RuntimeError: CUDA out of memory
```

**Sequence Fetching Errors**
```python  
# Check genome assembly and coordinates
Exception: Failed to fetch genome sequence from UCSC API: 404
```

**Position Validation**
```python
# Ensure variant position is within fetched window
ValueError: Variant position outside the fetched window
```

## 📝 Logging

The backend provides comprehensive logging:

```python
print("Loading Evo2 model...")
print(f"Fetching: {windowSize}bp window around position {position}")
print(f"Loaded reference genome sequence window (length: {len(sequence)} bases)")
```

## 🔒 Security & Limits

### Rate Limiting
- Modal automatically handles scaling and rate limiting
- Cold start protection with keep-warm containers

### Input Validation
- Genomic coordinates validation
- Nucleotide alphabet checking (A, T, G, C only)
- Sequence length constraints

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Arc Institute**: Evo2 model development
- **Findlay et al.**: BRCA1 variant dataset
- **UCSC Genome Browser**: Reference sequence API
- **Modal**: Serverless GPU infrastructure

## 📞 Support

For questions or issues:
1. Check the [Evo2 GitHub repository](https://github.com/arcinstitute/evo2)
2. Review Modal documentation
3. Open an issue in this repository

---

Built with ❤️ for genomic variant analysis
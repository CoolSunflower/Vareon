import sys
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

@app.function(gpu="H100", volumes = {mount_path: volume}, timeout = 1000)
def run_brca1_analysis():
    import base64
    from io import BytesIO
    from Bio import SeqIO
    import gzip
    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd
    import os
    import seaborn as sns
    from sklearn.metrics import roc_auc_score, roc_curve

    from evo2 import Evo2
    WINDOW_SIZE = 8192

    print("Loading Evo2 model...")
    model = Evo2('evo2_7b')
    print("Evo2 model loaded")

    brca1_df = pd.read_excel(
        './evo2/notebooks/brca1/41586_2018_461_MOESM3_ESM.xlsx',
        header=2,
    )
    brca1_df = brca1_df[[
        'chromosome', 'position (hg19)', 'reference', 'alt', 'function.score.mean', 'func.class',
    ]]

    brca1_df.rename(columns={
        'chromosome': 'chrom',
        'position (hg19)': 'pos',
        'reference': 'ref',
        'alt': 'alt',
        'function.score.mean': 'score',
        'func.class': 'class',
    }, inplace=True)

    # Convert to two-class system
    brca1_df['class'] = brca1_df['class'].replace(['FUNC', 'INT'], 'FUNC/INT')

    # Read the reference genome sequence of chromosome 17
    with gzip.open('./evo2/notebooks/brca1/GRCh37.p13_chr17.fna.gz', "rt") as handle:
        for record in SeqIO.parse(handle, "fasta"):
            seq_chr17 = str(record.seq)
            break

    # Build mappings of unique reference sequences
    ref_seqs = []
    ref_seq_to_index = {}

    # Parse sequences and store indexes
    ref_seq_indexes = []
    var_seqs = []

    brca1_subset = brca1_df.iloc[:500].copy()

    for _, row in brca1_subset.iterrows():
        pos = row['pos']
        ref = row['ref']
        alt = row['alt']

        p = pos - 1 # Convert to 0-indexed position
        full_seq = seq_chr17

        ref_seq_start = max(0, p - WINDOW_SIZE//2)
        ref_seq_end = min(len(full_seq), p + WINDOW_SIZE//2)
        ref_seq = seq_chr17[ref_seq_start:ref_seq_end]
        snv_pos_in_ref = min(WINDOW_SIZE//2, p)
        var_seq = ref_seq[:snv_pos_in_ref] + alt + ref_seq[snv_pos_in_ref+1:]

        # Sanity checks
        assert len(var_seq) == len(ref_seq)
        assert ref_seq[snv_pos_in_ref] == ref
        assert var_seq[snv_pos_in_ref] == alt

        # Get or create index for reference sequence
        if ref_seq not in ref_seq_to_index:
            ref_seq_to_index[ref_seq] = len(ref_seqs)
            ref_seqs.append(ref_seq)
        
        ref_seq_indexes.append(ref_seq_to_index[ref_seq])
        var_seqs.append(var_seq)

    ref_seq_indexes = np.array(ref_seq_indexes)

    print(f'Scoring likelihoods of {len(ref_seqs)} reference sequences with Evo 2...')
    ref_scores = model.score_sequences(ref_seqs)

    print(f'Scoring likelihoods of {len(var_seqs)} variant sequences with Evo 2...')
    var_scores = model.score_sequences(var_seqs)
    
    # Subtract score of corresponding reference sequences from scores of variant sequences
    delta_scores = np.array(var_scores) - np.array(ref_scores)[ref_seq_indexes]

    # Add delta scores to dataframe
    brca1_subset[f'evo2_delta_score'] = delta_scores

    # Finding Classification Threshold
    # To find classification threshold, we will use ROC curve and find the threshold as the Youden J Index
    # Since delta score --> more negative is harmful and negative towards 0 or positive is functionally fine, therefore, we will negate delta score to directly coorespond to pathogenicity.

    # Youden's J index will be calculated by maximimg TPR - FPR in ROC of -delta_scores
    yTrue = (brca1_subset['class'] == 'LOF')
    fpr, tpr, thresholds = roc_curve(yTrue, -brca1_subset['evo2_delta_score'])
    optimalIdx = (tpr - fpr).argmax()
    optimalThreshold = -thresholds[optimalIdx]

    # We will also calculate standard deviation of delta scores around the threshold, this will help us in defining the model confidence of the predictions made
    # i.e. we will use (deltaScore-threshold)/(standardDeviation of predicted class) as direct coorelation to confidence of model prediction
    lofScores = brca1_subset.loc[brca1_subset['class'] == "LOF", "evo2_delta_score"]
    funcScores = brca1_subset.loc[brca1_subset['class'] == "FUNC/INT", "evo2_delta_score"]
    lofStd = lofScores.std()
    funcStd = funcScores.std()

    confidenceParams = {
        "threshold": optimalThreshold,
        "lof_std": lofStd,
        "func_std": funcStd,
    }
    print("Confidence Parameters: ", confidenceParams)

    # Calculate AUROC of zero-shot predictions
    y_true = (brca1_subset['class'] == 'LOF')
    auroc = roc_auc_score(y_true, -brca1_subset['evo2_delta_score'])
    print(f'AUROC: {auroc:.2}')    

    plt.figure(figsize=(4, 2))
    # Plot stripplot of distributions
    p = sns.stripplot(
        data=brca1_subset,
        x='evo2_delta_score',
        y='class',
        hue='class',
        order=['FUNC/INT', 'LOF'],
        palette=['#777777', 'C3'],
        size=2,
        jitter=0.3,
    )
    # Mark medians from each distribution
    sns.boxplot(showmeans=True,
                meanline=True,
                meanprops={'visible': False},
                medianprops={'color': 'k', 'ls': '-', 'lw': 2},
                whiskerprops={'visible': False},
                zorder=10,
                x="evo2_delta_score",
                y="class",
                data=brca1_subset,
                showfliers=False,
                showbox=False,
                showcaps=False,
                ax=p)
    plt.xlabel('Delta likelihood score, Evo 2')
    plt.ylabel('BRCA1 SNV class')
    plt.tight_layout()

    buffer = BytesIO()
    plt.savefig(buffer, format="png")
    buffer.seek(0)
    plot_data = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return {'variants': brca1_subset.to_dict(orient="records"), "plot": plot_data, "auroc": auroc}

@app.function()
def brca1_example():
    import base64
    import matplotlib.pyplot as plt
    import matplotlib.image as mpimg
    print("Running BRCA1 variant analysis with Evo2...")

    # Run inference on cloud
    result = run_brca1_analysis.remote()

    # Show cloud from returned data
    if "plot" in result:
        plot_data = base64.b64decode(result["plot"])
        with open("brca1_analysis_plot.png", "wb") as f:
            f.write(plot_data)

@app.local_entrypoint()
def main():
    brca1_example.local()
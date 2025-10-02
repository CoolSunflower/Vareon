# Details of EVO2 Model

## DNA & Dataset

DNA Patterns Learned during Pretraining (8k):

1. Codons as basic units that code for protein. Learned during pretraining phase.
2. Introns & Exons. Can be classified using intermediate layer embeddings of the model
3. Promoter Motifs: Mark start of a gene. Learned during pretraining.

DNA Patterns Learned during mid-training (longer sequences):

1. Handle complex long sequences of exons and introns, to learn the longer gene features and relations between genes.
2. Regulators (Enhancers & Silencers): Regulators can be very far from actual gene (due to gene folding), so to learn interaction of genes with regulators we need larger context windows.

Training data distribution:
More tokens consumed during pretraining to learn DNA grammar from scratch. Midtraining focuses on controlled large scale pattern learning and consumes way less tokens.

Trained on multiple organisms: The broad understanding helps the model find patterns that it was not trained on. Example, it could detect BRCA2 mutations even when not trained on those in a human genome. The model likely understood parts that often stay similar across species are functionally important, and was thus able to identify variations in BRCA2 dataset as being harmful.
The only human genome it was trained on was OpenGenome2!

## Training Details

Released in 40B (9.3T), 7B (2.4T), 1B (1T) parameter variants.
Architecture is based on StripedHyena2 model. Uses a framework called Vortex for actually training the model.

Input: Tokenized sequence as tensors. Output: Logits (probability) for each possible token (A, T, G, C and some short combinations).

Generate function: Autoregressive generation of sequence given a tokenized input sequence.

Loss function: Mean Sample-Weighted Cross Entropy Loss. The weight of a sample = 1 (if exonic), 0.1 if intronic & repetitive. This allows the model to focus on correctly predicting the nucleotide in the unique part of genome. (Repetitive part was annotated in a pre-processing step)

For positional encoding of input, they use RoPE aka Rotary Positional Embedding. During training, as we sequentially increase context window of training tokens, the base frequency of RoPE embeddings is increased & positional index is decreased.

RoPE: Each vector position gets rotated by a specific angle m. Encodes relative positioning really well. Base frequency decides the m. A given base position is given by x\*m. Since rotation continously wraps around it can generalise better to sequences never seen before.
As discussed earlier, the authors used two different rotary embedding-based methods to adapt to longer sequences (as we increased size during training):
1. Increasing Base Frequency: As context length increases, the same position line (0 - 360) now needs to fit many more samples, and thus we increase the number of positions by increasing the frequency. This ensures that the relative difference between sample positions remains consistent.
2. Positional Interpolation by Down scaling the positional index of tokens: If model has seen 4 positions, and now we double the number of samples, we will downscale the new positions by a factor of 2 (i.e. scaled down 0.5) so that the new positions fit around the original 4 positions, i.e. in the formula rot(pos) = pos*base_angle, we are downscaling position of the sample so that it fits close to the original position. 
So, positional interpolation maps the new position range to the old one the model learned. Base frequency scaling adjusts the rate at which angles change within that mapped range. So by preventing the angles from wrapping 360 degrees too quickly, it maintains unique rotation values for positions that are much farther apart. 
Evo2 uses a mix of both strategies in its RoPE embeddings.

## Use-cases
Trained on 9.3T bps, 1 million token context window.

1. **Generative Tasks**: Evo2 is fundamentally a generative model, given an input sequence of nucleotides, it autoregressively predicts next base pairs. Tested by guided generation of Mitochondrial genes, found that it generated diverse outputs with varying degrees of sequence identity to natural proteins. The generated genes maintained synteny (~order) with diversity. It was found using AlphaFold3 that the generated sequence protein matched structurally with naturally occuring mitochondrial proteins. Thus EVO2 has learned deeper patterns than pure sequential. 
This was also tested by generating sequences and matching them with existing proteins, and the matching was always found between 70-100% with existing protein database. Thus it produces biologically plausible sequences and is not just overfitting.
2. **Guided Generation**: Designing genomes for specific goals. 
Chromatin Accessibility: How physically open and reachable a particular gene is within its packaged chromatin. Every cell stores full genome, but different regions of DNA have different chromatin accessibility in different types of cell.
The goal of guided generation is to design DNA so that certain chromatins are more or less accessible. This would also for controlled differentiation of cells. Given a design goal of generating a DNA sequence which had some given peak patterns, they were able to generate DNA sequences that had very similar chromatin accessibility profiles to what was desired.
How did they do this with evo2? Enformer & Borzoi are AI models that can predict chromatin accessibility but cant generate sequences. Evo2 can generate sequences but cant apply conditions to generation directly. Therefore both models were used together to generate sequences that matched the desired chromatin accessibility profile via a beam search strategy. 
3. **Prediction Tasks**: To spot mutations in DNA by giving a score to every nucleotide based on sequential likelihood.
4. **Embeddings**: Rich and informative vectors generated in intermediate layer during DNA processing. These can be used for downstream tasks like genetic variant cancer risk prediction (Example: Reference Embeddings (embedding of genome from person without mutation), Sample Embeddings (embedding of genome with cancerous mutation) will be fed to an AI model that will be trained to output if the variation is pathogenic or not).
export interface GenomeAssemblyFromSearch {
    id: string;
    name: string;
    sourceName: string;
    active: boolean;
}

export interface ChromosomeData {
    name: string;
    size: number;
}

export interface GeneFromSearch {
    symbol: string;
    name: string;
    chromosome: string;
    description: string;
    gene_id: string;
}

export interface GeneDetailsFromSearch {  
    genomicInfo?: {
        chrStart: number;
        chrStop: number;
        strand?: string;
    }[];
    organism?: {
        scientificName: string;
        commonName: string;
    }
    summary?: string;
}

export interface GeneBounds {
    max: number;
    min: number;
}

export async function getAvailableGenomes() {
    const apiUrl = "https://api.genome.ucsc.edu/list/ucscGenomes";

    const response = await fetch(apiUrl);
    if(!response.ok) {
        throw new Error("Failed to fetch genome list from UCSC API");
    }

    const genomeData = await response.json();
    if(!genomeData.ucscGenomes){
        throw new Error("UCSC API Error: missing ucscGenomes field");
    }

    const genomes = genomeData.ucscGenomes;

    const structuredGenomes: Record<string, GenomeAssemblyFromSearch[]> = {};
    for(const genomeId in genomes){
        const genomeInfo = genomes[genomeId];
        const organism = genomeInfo.organism || "Other";

        if(!structuredGenomes[organism]) structuredGenomes[organism] = [];

        structuredGenomes[organism].push({
            id: genomeId,
            name: genomeInfo.description || genomeId,
            active: !!genomeInfo.active, // 1 --> true, 0 --> false
            sourceName: genomeInfo.sourceName || genomeId,
        })
    }

    return {genomes: structuredGenomes}
}

export async function getGenomeChromosomes(genomeId: string) {
    const apiUrl = `https://api.genome.ucsc.edu/list/chromosomes?genome=${genomeId}`;

    const response = await fetch(apiUrl);
    if(!response.ok) {
        throw new Error(`Failed to fetch chromosome list from UCSC API for genome ${genomeId}`);
    }

    const chromosomeData = await response.json();
    if(!chromosomeData.chromosomes){
        throw new Error("UCSC API Error: missing chromosomes field");
    }

    const chromosome: ChromosomeData[] = [];
    for (const chromId in chromosomeData.chromosomes){
        if(chromId.includes("_") || chromId.includes("random") || chromId.includes("Un")) continue;
        chromosome.push({name: chromId, size: chromosomeData.chromosomes[chromId]});
    }

    chromosome.sort((a, b) => {
        const anum = a.name.replace("chr", "");
        const isNumA = /^\d+$/.test(anum);
        const bnum = b.name.replace("chr", "");
        const isNumB = /^\d+$/.test(bnum);

        if (isNumA && isNumB) return Number(anum) - Number(bnum);
        if (isNumA) return -1;
        if (isNumB) return 1;
        return anum.localeCompare(bnum);
    });

    return { chromosomes: chromosome };
}

export async function searchGenes(query: string, genome: string){
    const url = "https://clinicaltables.nlm.nih.gov/api/ncbi_genes/v3/search";

    const params = new URLSearchParams({
        terms: query,
        df: "chromosome,Symbol,description,map_location,type_of_gene",
        ef: "chromosome,Symbol,description,map_location,type_of_gene,GenomicInfo,GeneID",
    });

    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
        throw new Error(`NCBI API Error: Failed to search genes: ${response.statusText}`);
    }

    const data = await response.json();
    const results: GeneFromSearch[] = [];

    if (data[0] > 0) {
        const fieldMap = data[2];
        const geneIds = fieldMap.GeneID || [];
        for (let i = 0; i < Math.min(10, data[0]); ++i) {
            if (i < data[3].length) {
                try {
                    const display = data[3][i];
                    let chrom = display[0];
                    if (chrom && !chrom.startsWith("chr")) {
                        chrom = `chr${chrom}`;
                    }

                    results.push({
                        symbol: display[2],
                        name: display[3],
                        chromosome: chrom,
                        description: display[3],
                        gene_id: geneIds[i] || "",
                    });

                } catch {
                    continue;
                }
            }
        }
    }

    return { query, genome, results };
}

export async function fetchGeneDetails(geneId: string): Promise<{geneDetails: GeneDetailsFromSearch | null; geneBounds: GeneBounds | null; initialRange: { start: number; end: number } | null;}> {
  try {
    const detailUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`;
    const detailsResponse = await fetch(detailUrl);

    if (!detailsResponse.ok) {
      console.error(
        `NCBI API Error: Failed to fetch gene details: ${detailsResponse.statusText}`,
      );
      return { geneDetails: null, geneBounds: null, initialRange: null };
    }

    const detailData = await detailsResponse.json();

    if (detailData.result && detailData.result[geneId]) {
      const detail = detailData.result[geneId];

      if (detail.genomicinfo && detail.genomicinfo.length > 0) {
        const info = detail.genomicinfo[0];

        const minPos = Math.min(info.chrstart, info.chrstop);
        const maxPos = Math.max(info.chrstart, info.chrstop);
        const bounds = { min: minPos, max: maxPos };

        // initialRange is set to show up to 10,000 bases of the gene, starting from the gene's start position
        const geneSize = maxPos - minPos;
        const seqStart = minPos;
        const seqEnd = geneSize > 10000 ? minPos + 10000 : maxPos;
        const range = { start: seqStart, end: seqEnd };

        return { geneDetails: detail, geneBounds: bounds, initialRange: range };
      }
    }

    return { geneDetails: null, geneBounds: null, initialRange: null };
  } catch (err) {
    return { geneDetails: null, geneBounds: null, initialRange: null };
  }
}

export async function fetchGeneSequence(chrom: string, start: number, end: number, genomeId: string,): Promise<{sequence: string; actualRange: { start: number; end: number }; error?: string;}> {
  try {
    const chromosome = chrom.startsWith("chr") ? chrom : `chr${chrom}`;

    const apiStart = start - 1;
    const apiEnd = end;

    const apiUrl = `https://api.genome.ucsc.edu/getData/sequence?genome=${genomeId};chrom=${chromosome};start=${apiStart};end=${apiEnd}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    const actualRange = { start, end };

    if (data.error || !data.dna) {
      return { sequence: "", actualRange, error: data.error };
    }

    const sequence = data.dna.toUpperCase();

    return { sequence, actualRange };
  } catch (err) {
    return {
      sequence: "",
      actualRange: { start, end },
      error: "Internal error in fetch gene sequence",
    };
  }
}
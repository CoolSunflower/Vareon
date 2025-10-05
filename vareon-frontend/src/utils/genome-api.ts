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
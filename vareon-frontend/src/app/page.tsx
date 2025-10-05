"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Input } from "~/components/ui/input";
import GeneViewer from "~/components/gene-viewer";
import { Select, SelectItem, SelectTrigger, SelectContent, SelectValue } from "~/components/ui/select";
import { type GenomeAssemblyFromSearch, type ChromosomeData, getAvailableGenomes, getGenomeChromosomes, searchGenes, type GeneFromSearch } from "~/utils/genome-api";
import { ModeToggle } from "~/components/mode-toggle";
import { Button } from "~/components/ui/button";
import { Search } from "lucide-react";
import { set } from "zod/v4";

type Mode = "search" | "browse";

export default function HomePage() {
  const [genomes, setGenomes] = useState<GenomeAssemblyFromSearch[]>([]);
  const [chromosomes, setChromosomes] = useState<ChromosomeData[]>([]);
  const [selectedGenome, setSelectedGenome] = useState<string>("hg38");
  const [selectedChromosome, setSelectedChromosome] = useState<string>("chr1");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [mode, setMode] = useState<Mode>("search")
  const [searchResults, setSearchResults] = useState<GeneFromSearch[]>([]);
  const [selectedGene, setSelectedGene] = useState<GeneFromSearch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGenomes = async () => {
      try {
        setIsLoading(true);
        const data = await getAvailableGenomes();

        if(data.genomes["Human"]) {
          setGenomes(data.genomes["Human"]);
        }
      } catch (error) {
        const message = (error as Error)?.message ?? String(error);
        console.error('Failed to fetch genomes:', error);
        setError("Failed to load genome data:" + message);
      } finally {
        setIsLoading(false);
      }
    };
    
    void fetchGenomes();
  }, []);

  useEffect(() => {
    const fetchChromosomes = async () => {
      try {
        setIsLoading(true);
        const data = await getGenomeChromosomes(selectedGenome);
        setChromosomes(data.chromosomes);

        if(data.chromosomes.length > 0) {
          setSelectedChromosome(data.chromosomes[0]!.name);
        }
      } catch (error) {
        const message = (error as Error)?.message ?? String(error);
        console.error('Failed to fetch chromosomes:', error);
        setError("Failed to load chromosome data:" + message);
      } finally {
        setIsLoading(false);
      }
    };
    
    void fetchChromosomes();
  }, [selectedGenome]);

  const handleGenomeChange = (genome: string) => {
    setSelectedGenome(genome);
    setSearchResults([]);
    setError(null);
    setSelectedGene(null);
  }

  // Cache timeout configuration (in milliseconds)
  const CACHE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  // Cache utility functions
  const isCacheValid = (timestamp: number): boolean => {
    return Date.now() - timestamp < CACHE_TIMEOUT;
  };

  const getCachedData = (cacheKey: string) => {
    try {
      const cachedEntry = localStorage.getItem(cacheKey);
      if (!cachedEntry) return null;

      const { data, timestamp } = JSON.parse(cachedEntry);
      
      if (isCacheValid(timestamp)) {
        return data;
      } else {
        // Remove expired cache entry
        localStorage.removeItem(cacheKey);
        return null;
      }
    } catch (error) {
      console.warn('Failed to parse cached data:', error);
      localStorage.removeItem(cacheKey);
      return null;
    }
  };

  const setCachedData = (cacheKey: string, data: any) => {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch (error) {
      console.warn('Failed to cache data:', error);
    }
  };

  const performGeneSearch = async (query: string, genome: string, filterFn?: (gene: GeneFromSearch) => boolean) => {
    setIsLoading(true);
    setError(null);

    try {
      const cacheKey = `gene-search-${query}-${genome}`;
      const cachedResults = getCachedData(cacheKey);

      if (cachedResults) {
        const results = filterFn ? cachedResults.filter(filterFn) : cachedResults;
        setSearchResults(results);
        console.log("Loaded search results from cache (valid for", Math.round((CACHE_TIMEOUT - (Date.now() - JSON.parse(localStorage.getItem(cacheKey)!).timestamp)) / 1000 / 60), "more minutes)");
        return;
      }

      const data = await searchGenes(query, genome);
      const results = filterFn ? data.results.filter(filterFn) : data.results;
      console.log("Fetched search results from API", results);

      setSearchResults(results);
      setCachedData(cacheKey, data.results);
    } catch (error) {

      const message = (error as Error)?.message ?? String(error);
      console.error('Failed to perform gene search:', error);
      setError("Failed to perform gene search:" + message);
      return [];

    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if(!selectedChromosome || mode !== "browse") return;
    
    // Perform gene search with chromosome filter
    void performGeneSearch(selectedChromosome, selectedGenome, (gene: GeneFromSearch) => gene.chromosome === selectedChromosome);
  }, [selectedChromosome, mode, selectedGenome]);

  // User Search in Search Mode
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    // Perform gene search
    void performGeneSearch(searchQuery, selectedGenome);
  }

  const setBRCA1Example = () => {
    setMode("search");
    setSearchQuery("BRCA1");
    void performGeneSearch("BRCA1", selectedGenome);
  }
    
  const switchMode = (newMode: Mode) => {
    if (newMode === mode) return;

    setSearchResults([]);
    setSelectedGene(null);
    setError(null);

    if (newMode === "browse" && selectedChromosome) {
      // When switching to browse mode, perform search for selected chromosome
      void performGeneSearch(selectedChromosome, selectedGenome, (gene: GeneFromSearch) => gene.chromosome === selectedChromosome);
    }

    setMode(newMode);
  }

  return (
    <div className="min-h-screen bg-[#e9eeea] dark:bg-[#1a1f1b] transition-colors">
      <header className="border-b border-[#3c4f3d40] dark:border-[#4a5a4d] bg-white dark:bg-[#242b25] transition-colors">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <h1 className="text-xl font-light tracking-wide text-[#3c4f3d] dark:text-[#c4d4c6]">
                  <span className="font-normal">Vareon</span>
                </h1>
                <div className="absolute -bottom-1 left-0 h-[2px] w-17 bg-[#de8246]"></div>
              </div>
              <span className="text-m font-light text-[#3c4f3d]/70 dark:text-[#a8b8aa]">
                EVO<span className="text-[#de8246]">2</span> Variant Analysis
              </span>
            </div>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        {selectedGene ? (
          <GeneViewer gene={selectedGene} genomeId={selectedGenome} onClose={() => setSelectedGene(null)} />
        ) : (
        <>
          <Card className="mb-6 gap-0 border-none bg-white dark:bg-[#242b25] py-0 shadow-sm transition-colors">
            <CardHeader className="pt-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-normal text-[#3c4f3dd3] dark:text-[#c4d4c6]">
                  Genome Assembly
                </CardTitle>
                <div className="text-xs text-[#3c4f3db3] dark:text-[#a8b8aa]">Organism: <span className="font-medium">Human</span></div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <Select 
                value = {selectedGenome} 
                onValueChange={handleGenomeChange} 
                disabled={isLoading}
              >
                <SelectTrigger className="h-9 w-full border-[#3c4f3d40]">
                  <SelectValue placeholder="Select genome assembly" />
                  <SelectContent>
                    {genomes.map((genome) => (
                      <SelectItem key = {genome.id} value = {genome.id}>
                        {genome.id} - {genome.name}
                        {genome.active ? " (active)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectTrigger>
              </Select>
              {
                selectedGenome && <p className="mt-2 text-xs text-[#3c4f3dc0] dark:text-[#8a9a8c]">{genomes.find(genome => genome.id == selectedGenome)?.sourceName}</p>
              }
            </CardContent>
          </Card>

          <Card className="gap-0 mt-6 border-none bg-white dark:bg-[#242b25] py-0 shadow-sm transition-colors">
            <CardHeader className="pt-4 pb-2">
              <CardTitle className="text-sm font-normal text-[#3c4f3dd3] dark:text-[#c4d4c6]">Browse</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <Tabs 
                value={mode} 
                onValueChange={(value) => switchMode(value as Mode)}
              >
                <TabsList className="mb-4 bg-[#e9eeea] dark:bg-[#1a1f1b]">
                  <TabsTrigger className="data-[state=active]:bg-white data-[state=active]:text-[#3c4f3d] dark:data-[state=active]:text-[#c4d4c6]" value="search">Search Genes</TabsTrigger>
                  <TabsTrigger className="data-[state=active]:bg-white data-[state=active]:text-[#3c4f3d] dark:data-[state=active]:text-[#c4d4c6]" value="browse">Browse Chromosomes</TabsTrigger>
                </TabsList>

                <TabsContent value="search" className="mt-0">
                  <div className="space-y-4">
                    <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
                      <div className="relative flex-1">
                        <Input type="text" placeholder="Enter gene symbol or name" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 border-[#3c4f3d40] pr-10"/>
                        <Button className="absolute top-0 right-0 h-full cursor-pointer rounded-l-none bg-[#3c4f3d] text-white hover:bg-[#3c4f3dd0]" disabled={isLoading || !searchQuery.trim()} size="icon" type="submit"><Search className="h-4 w-4" /><span className="sr-only">Search</span></Button>
                      </div>
                    </form>
                    <Button onClick={setBRCA1Example} variant="link" className="h-auto cursor-pointer p-0 text-[#de8246] dark:text-[#c4d4c6] dark:hover:text-[#c4d4c6c0] hover:text-[#de8246c0]">Try BRCA1 example</Button>
                  </div>
                </TabsContent>

                <TabsContent value="browse" className="mt-0">
                  <div className="max-h-[150px] overflow-y-auto pr-1">
                    <div className="flex flex-wrap gap-2">
                      {chromosomes.map((chrom) => (
                        <Button key={chrom.name} variant="outline" size="sm" className={`h-8 cursor-pointer border-[#3c4f3d40] hover:bg-[#e9eeea] dark:hover:bg-[#e9eeea] hover:text-[#3c4f3d] ${selectedChromosome === chrom.name ? "text-[#3c4f3d] bg-[#e9eeea] dark:text-[#3c4f3d] dark:bg-[#e9eeea]" : ""}`} onClick={() => setSelectedChromosome(chrom.name)}>
                          {chrom.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

              </Tabs>

              {isLoading && (<div className="flex justify-center py-4"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3c4f3d80] border-t-[#de8243]"></div></div>)}
              {error && (<div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-300 dark:text-red-900">{error}</div>)}

              {(searchResults.length > 0 && !isLoading) && 
                <div className="mt-6">
                  <div className="mb-2">
                    <h4 className="text-xs font-normal text-[#3c4f3dd3] dark:text-[#c4d4c6d3]">{mode === "search" ? 
                      <>
                        Search Results: {" "}<span className="font-medium text-[#3c4f3d] dark:text-[#c4d4c6]">{searchResults.length} genes</span>
                      </> 
                      : 
                      <>
                        Genes on {selectedChromosome}: {" "}<span className="font-medium text-[#3c4f3d] dark:text-[#c4d4c6]">{searchResults.length} found</span>
                      </>}
                    </h4>
                  </div>

                  <div className="overflow-hidden rounded-md border border-[#3c4f3d]/5 dark:border-[#c4d4c6]/5">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[#e9eeea]/50 dark:bg-[#3c4f3d]/50 hover:bg-[e9eeea]/70 dark:hover:bg-[#3c4f3d]/70">
                          <TableHead className="text-xs font-normal text-[#3c4f3d]/70 dark:text-[#c4d4c6]/70">
                            Symbol
                          </TableHead>
                          <TableHead className="text-xs font-normal text-[#3c4f3d]/70 dark:text-[#c4d4c6]/70">
                            Name
                          </TableHead>
                          <TableHead className="text-xs font-normal text-[#3c4f3d]/70 dark:text-[#c4d4c6]/70">
                            Location
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {searchResults.map((gene, index) => (
                          <TableRow
                            key={`${gene.symbol}-${index}`}
                            className="cursor-pointer border-b border-[#3c4f3d]/5 hover:bg-[#e9eeea]/50 dark:hover:bg-[#3c4f3d]/50"
                            onClick={() => setSelectedGene(gene)}
                          >
                            <TableCell className="py-2 font-medium text-[#3c4f3d] dark:text-[#c4d4c6]">
                              {gene.symbol}
                            </TableCell>
                            <TableCell className="py-2 font-medium text-[#3c4f3d] dark:text-[#c4d4c6]">
                              {gene.name}
                            </TableCell>
                            <TableCell className="py-2 font-medium text-[#3c4f3d] dark:text-[#c4d4c6]">
                              {gene.chromosome}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              }

              {!isLoading && !error && searchResults.length === 0 && (
                <div className="flex h-48 flex-col items-center justify-center text-center text-gray-400">
                  <Search className="mb-4 h-10 w-10 text-gray-400" />
                  <p className="text-sm leading-relaxed">
                    {mode === "search"
                      ? "Enter a gene or symbol and click search"
                      : selectedChromosome
                        ? "No genes found on this chromosome"
                        : "Select a chromosome to view genes"}
                  </p>
                </div>
              )}

            </CardContent>
          </Card>
        </>)}
      </main>
    </div>
  );
}

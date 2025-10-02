"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card";
import { Select, SelectItem, SelectTrigger, SelectContent, SelectValue } from "~/components/ui/select";
import { type GenomeAssemblyFromSearch, type ChromosomeData, getAvailableGenomes, getGenomeChromosomes } from "~/utils/genome-api";
import { ModeToggle } from "~/components/mode-toggle";

export default function HomePage() {
  const [genomes, setGenomes] = useState<GenomeAssemblyFromSearch[]>([]);
  const [chromsomes, setChromosomes] = useState<ChromosomeData[]>([]);
  const [selectedGenome, setSelectedGenome] = useState<string>("hg38");
  const [selectedChromosome, setSelectedChromosome] = useState<string>("chr1");
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
      </main>
    </div>
  );
}

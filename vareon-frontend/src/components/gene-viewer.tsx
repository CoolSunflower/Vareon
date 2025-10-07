"use client";

import type { GeneFromSearch } from "~/utils/genome-api";
import { Button } from "./ui/button";
import { ArrowLeft } from "lucide-react";
import { GeneInformation } from "./gene-information";
import { fetchGeneDetails, fetchGeneSequence as apiFetchGeneSequence } from "~/utils/genome-api";
import { type GeneDetailsFromSearch, type GeneBounds } from "~/utils/genome-api";
import { useCallback, useEffect, useState } from "react";
// import { GeneSequence } from './gene-sequence';

export default function GeneViewer({gene, genomeId, onClose}: {gene: GeneFromSearch, genomeId: string, onClose: () => void}) {
    const [geneDetail, setGeneDetail] = useState<GeneDetailsFromSearch | null>(null);
    const [geneBounds, setGeneBounds] = useState<GeneBounds | null>(null);
    const [startPosition, setStartPosition] = useState<string>("");
    const [endPosition, setEndPosition] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [geneSequence, setGeneSequence] = useState<string>("");
    const [isLoadingSequence, setIsLoadingSequence] = useState<boolean>(false);
    const [actualRange, setActualRange] = useState<{start: number, end: number} | null>(null);

    const fetchGeneSequence = useCallback(async (start: number, end: number) => {
        try {
            setIsLoadingSequence(true);
            setError(null);

            const {sequence, actualRange, error} = await apiFetchGeneSequence(gene.chromosome, start, end, genomeId);

            setGeneSequence(sequence);
            setActualRange(actualRange);

            if (error) {
                setError(error);
            }
        } catch {
            setError("Failed to fetch gene sequence.");
        } finally {
            setIsLoadingSequence(false);
        }
    }, [gene.chromosome, genomeId]);

    useEffect(() => {
        // Fetch gene details when component mounts
        const initializeGeneData = async () => {
            setLoading(true);
            setError(null);

            if (!gene.gene_id) {
                setError("Gene ID is missing, cannot fetch details");
                setLoading(false);
                return;
            }

            try {
                const {
                    geneDetails: fetchedDetail,
                    geneBounds: fetchedGeneBounds,
                    initialRange: fetchedRange,
                } = await fetchGeneDetails(gene.gene_id);

                setGeneDetail(fetchedDetail);
                setGeneBounds(fetchedGeneBounds);

                if (fetchedRange) {
                    setStartPosition(String(fetchedRange.start));
                    setEndPosition(String(fetchedRange.end));
                    await fetchGeneSequence(fetchedRange.start, fetchedRange.end);
                }
            } catch {
                setError("Failed to load gene information. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        void initializeGeneData();
    }, [gene, genomeId]);


    return <div className="space-y-6">
        <Button variant="ghost" size="sm" className="cursor-pointer text-[#3c4f3d] dark:text-[#c4d4c6] hover:bg-[#e9eeea] dark:hover:bg-[#3c4f3d]/50 transition-colors" onClick={onClose}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to results
        </Button>

        <GeneInformation gene={gene} geneDetail={geneDetail} geneBounds={geneBounds} />
    </div>;
}
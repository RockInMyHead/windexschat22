import { useState, useCallback } from 'react';
import { apiClient, type Artifact } from '@/lib/api';

interface UseArtifactsReturn {
  artifacts: Map<number, Artifact>;
  isLoading: boolean;
  setArtifacts: (updater: (prev: Map<number, Artifact>) => Map<number, Artifact>) => void;
  loadArtifact: (artifactId: number) => Promise<Artifact | null>;
  loadArtifacts: (artifactIds: number[]) => Promise<void>;
  resetArtifacts: () => void;
  getArtifact: (artifactId: number) => Artifact | undefined;
}

export const useArtifacts = (): UseArtifactsReturn => {
  const [artifacts, setArtifacts] = useState<Map<number, Artifact>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const loadArtifact = useCallback(async (artifactId: number): Promise<Artifact | null> => {
    try {
      // Проверяем, есть ли уже артефакт в кэше
      const cachedArtifact = artifacts.get(artifactId);
      if (cachedArtifact) {
        return cachedArtifact;
      }

      setIsLoading(true);
      const artifact = await apiClient.getArtifact(artifactId);

      setArtifacts(prev => new Map(prev).set(artifactId, artifact));
      return artifact;
    } catch (error) {
      console.error('Failed to load artifact:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []); // Убрали зависимость от artifacts, используем замыкание

  const loadArtifacts = useCallback(async (artifactIds: number[]): Promise<void> => {
    if (artifactIds.length === 0) return;

    try {
      setIsLoading(true);

      // Фильтруем уже загруженные артефакты
      const uniqueArtifactIds = [...new Set(artifactIds)].filter(
        id => !artifacts.has(id)
      );

      if (uniqueArtifactIds.length === 0) {
        setIsLoading(false);
        return;
      }

      // Загружаем все незагруженные артефакты параллельно
      const loadPromises = uniqueArtifactIds.map(async (artifactId) => {
        try {
          const artifact = await apiClient.getArtifact(artifactId);
          return { artifactId, artifact };
        } catch (error) {
          console.error(`Failed to load artifact ${artifactId}:`, error);
          return null;
        }
      });

      const results = await Promise.all(loadPromises);

      // Обновляем состояние с загруженными артефактами
      setArtifacts(prev => {
        const newArtifacts = new Map(prev);
        results.forEach(result => {
          if (result) {
            newArtifacts.set(result.artifactId, result.artifact);
          }
        });
        return newArtifacts;
      });
    } catch (error) {
      console.error('Failed to load artifacts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []); // Убрали зависимость от artifacts, используем замыкание

  const resetArtifacts = useCallback(() => {
    setArtifacts(new Map());
  }, []);

  const getArtifact = useCallback((artifactId: number): Artifact | undefined => {
    return artifacts.get(artifactId);
  }, []); // Убрали зависимость от artifacts, используем замыкание

  return {
    artifacts,
    isLoading,
    setArtifacts,
    loadArtifact,
    loadArtifacts,
    resetArtifacts,
    getArtifact,
  };
};

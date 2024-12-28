import React, { useState, useEffect } from 'react';
import { Book } from '../types/book';
import { BookCard } from './BookCard';
import { LoadingSpinner } from './LoadingSpinner';
import { getRecommendations } from '../services/recommendations';

interface RecommendationsSectionProps {
  favoriteBooks: Book[];
  onAddToFavorites: (book: Book) => void;
}

export function RecommendationsSection({ 
  favoriteBooks,
  onAddToFavorites
}: RecommendationsSectionProps) {
  const [recommendations, setRecommendations] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecommendations() {
      if (favoriteBooks.length === 0) {
        setRecommendations([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const results = await getRecommendations(favoriteBooks);
        setRecommendations(results);
      } catch (err) {
        setError('Failed to fetch recommendations');
      } finally {
        setLoading(false);
      }
    }

    fetchRecommendations();
  }, [favoriteBooks]);

  if (favoriteBooks.length === 0) {
    return null;
  }

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">
        Recommended for You
      </h2>

      {loading && <LoadingSpinner />}
      
      {error && (
        <div className="text-center py-4 text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && recommendations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {recommendations.map(book => (
            <BookCard 
              key={book.id} 
              book={book}
              onAddToFavorites={() => onAddToFavorites(book)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
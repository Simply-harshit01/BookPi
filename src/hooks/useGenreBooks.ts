import { useState, useEffect } from 'react';
import { getBooksByGenre } from '../services/googleBooks';
import { Book } from '../types/book';

export function useGenreBooks(genre: string) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBooks = async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await getBooksByGenre(genre);
        setBooks(results);
      } catch (err) {
        setError('Failed to fetch books');
        setBooks([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, [genre]);

  return { books, loading, error };
}
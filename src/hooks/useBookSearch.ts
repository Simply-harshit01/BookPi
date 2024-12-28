import { useState, useEffect } from 'react';
import { searchBooks } from '../services/googleBooks';
import { Book } from '../types/book';

export function useBookSearch(searchTerm: string) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBooks = async () => {
      if (!searchTerm.trim()) {
        setBooks([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const results = await searchBooks(searchTerm);
        setBooks(results);
      } catch (err) {
        setError('Failed to fetch books');
        setBooks([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchBooks, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm]);

  return { books, loading, error };
}
import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { BookCard } from './BookCard';
import { BookModal } from './BookModal';
import { LoadingSpinner } from './LoadingSpinner';
import { useGenreBooks } from '../hooks/useGenreBooks';
import { Book } from '../types/book';

interface GenreSectionProps {
  genre: string;
  onViewMore: () => void;
}

export function GenreSection({ genre, onViewMore }: GenreSectionProps) {
  const { books, loading, error } = useGenreBooks(genre);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  if (loading) return <LoadingSpinner />;
  if (error) return null;
  if (books.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">{genre}</h2>
        <button
          onClick={onViewMore}
          className="flex items-center text-blue-500 hover:text-blue-600"
        >
          View more
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {books.slice(0, 2).map(book => (
          <BookCard 
            key={book.id} 
            book={book}
            onClick={() => setSelectedBook(book)}
          />
        ))}
      </div>

      {selectedBook && (
        <BookModal
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
        />
      )}
    </section>
  );
}
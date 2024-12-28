import React, { useState } from 'react';
import { BookCard } from './BookCard';
import { BookModal } from './BookModal';
import { LoadingSpinner } from './LoadingSpinner';
import { GenreFilter } from './GenreFilter';
import { Book } from '../types/book';

interface SearchPageProps {
  books: Book[];
  loading: boolean;
  error: string | null;
  genres: string[];
  selectedGenre: string;
  onGenreChange: (genre: string) => void;
  onAddToFavorites?: (book: Book) => void;
}

export function SearchPage({
  books,
  loading,
  error,
  genres,
  selectedGenre,
  onGenreChange,
  onAddToFavorites
}: SearchPageProps) {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  
  const filteredBooks = books.filter(book => 
    !selectedGenre || book.genre === selectedGenre
  );

  return (
    <div className="space-y-6">
      {books.length > 0 && (
        <GenreFilter 
          genres={genres}
          selectedGenre={selectedGenre}
          onGenreChange={onGenreChange}
        />
      )}

      {loading && <LoadingSpinner />}

      {error && (
        <div className="text-center py-4 text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBooks.map(book => (
            <BookCard 
              key={book.id} 
              book={book}
              onAddToFavorites={onAddToFavorites}
              onClick={() => setSelectedBook(book)}
            />
          ))}
        </div>
      )}

      {selectedBook && (
        <BookModal
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onAddToFavorites={onAddToFavorites}
        />
      )}

      {!loading && !error && filteredBooks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            No books found matching your criteria.
          </p>
        </div>
      )}
    </div>
  );
}
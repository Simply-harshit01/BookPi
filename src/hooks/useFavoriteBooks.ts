import { useState } from 'react';
import { Book } from '../types/book';

export function useFavoriteBooks() {
  const [favoriteBooks, setFavoriteBooks] = useState<Book[]>([]);

  const addFavorite = (book: Book) => {
    setFavoriteBooks(prev => {
      if (prev.some(b => b.id === book.id)) return prev;
      return [...prev, book];
    });
  };

  const removeFavorite = (bookId: string) => {
    setFavoriteBooks(prev => prev.filter(book => book.id !== bookId));
  };

  return {
    favoriteBooks,
    addFavorite,
    removeFavorite
  };
}
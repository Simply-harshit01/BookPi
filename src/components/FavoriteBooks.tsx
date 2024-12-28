import React from 'react';
import { X } from 'lucide-react';
import { Book } from '../types/book';

interface FavoriteBooksProps {
  books: Book[];
  onRemove: (bookId: string) => void;
}

export function FavoriteBooks({ books, onRemove }: FavoriteBooksProps) {
  if (books.length === 0) {
    return (
      <div className="text-center p-4 bg-gray-50 rounded-lg">
        <p className="text-gray-600">Add some favorite books to get recommendations</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {books.map(book => (
        <div 
          key={book.id}
          className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm"
        >
          <div className="flex items-center gap-3">
            <img 
              src={book.coverUrl} 
              alt={book.title}
              className="w-12 h-16 object-cover rounded"
            />
            <div>
              <h4 className="font-medium">{book.title}</h4>
              <p className="text-sm text-gray-600">{book.author}</p>
            </div>
          </div>
          <button
            onClick={() => onRemove(book.id)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      ))}
    </div>
  );
}
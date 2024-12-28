import React from 'react';
import { Star, BookPlus } from 'lucide-react';
import { Book } from '../types/book';

interface BookCardProps {
  book: Book;
  onAddToFavorites?: (book: Book) => void;
  onClick?: () => void;
}

export function BookCard({ book, onAddToFavorites, onClick }: BookCardProps) {
  return (
    <div 
      className="bg-white rounded-lg shadow-md overflow-hidden transition-transform hover:scale-105 cursor-pointer"
      onClick={onClick}
    >
      <img 
        src={book.coverUrl} 
        alt={book.title}
        className="w-full h-64 object-cover"
      />
      <div className="p-4">
        <h3 className="text-xl font-semibold mb-1">{book.title}</h3>
        <p className="text-gray-600 mb-2">by {book.author}</p>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <Star className="w-5 h-5 text-yellow-400 fill-current" />
            <span className="ml-1 text-gray-700">{book.rating}</span>
          </div>
          {onAddToFavorites && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToFavorites(book);
              }}
              className="p-1 hover:bg-gray-100 rounded"
              title="Add to favorites"
            >
              <BookPlus className="w-5 h-5 text-blue-500" />
            </button>
          )}
        </div>
        <span className="inline-block px-2 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
          {book.genre}
        </span>
        <p className="mt-2 text-gray-700 text-sm line-clamp-2">{book.description}</p>
      </div>
    </div>
  );
}
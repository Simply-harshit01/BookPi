import React from 'react';
import { X, Star, BookOpen } from 'lucide-react';
import { Book } from '../types/book';

interface BookModalProps {
  book: Book;
  onClose: () => void;
  onAddToFavorites?: (book: Book) => void;
}

export function BookModal({ book, onClose, onAddToFavorites }: BookModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start">
            <h2 className="text-2xl font-bold text-gray-900">{book.title}</h2>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
          
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <img 
                src={book.coverUrl} 
                alt={book.title}
                className="w-full rounded-lg shadow-lg"
              />
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center">
                  <Star className="w-5 h-5 text-yellow-400 fill-current" />
                  <span className="ml-1 text-gray-700">{book.rating}</span>
                </div>
                {onAddToFavorites && (
                  <button
                    onClick={() => onAddToFavorites(book)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    Add to Favorites
                  </button>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Author</h3>
                <p className="text-gray-600">{book.author}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Genre</h3>
                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full">
                  {book.genre}
                </span>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Description</h3>
                <p className="text-gray-600 whitespace-pre-line">{book.description}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useState, useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import { SearchBar } from './components/SearchBar';
import { HomePage } from './components/HomePage';
import { SearchPage } from './components/SearchPage';
import { FavoriteBooks } from './components/FavoriteBooks';
import { RecommendationsSection } from './components/RecommendationsSection';
import { useBookSearch } from './hooks/useBookSearch';
import { useFavoriteBooks } from './hooks/useFavoriteBooks';

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  
  const { books, loading, error } = useBookSearch(searchTerm);
  const { favoriteBooks, addFavorite, removeFavorite } = useFavoriteBooks();

  const genres = useMemo(() => 
    Array.from(new Set(books.map(book => book.genre))),
    [books]
  );

  const handleGenreSelect = (genre: string) => {
    setSelectedGenre(genre);
    setSearchTerm(genre);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-blue-500" />
            <h1 className="text-3xl font-bold text-gray-900">BookReads</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Your Favorite Books</h3>
                <FavoriteBooks 
                  books={favoriteBooks}
                  onRemove={removeFavorite}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-8">
            <SearchBar 
              searchTerm={searchTerm} 
              onSearchChange={setSearchTerm} 
            />
            
            {searchTerm ? (
              <SearchPage
                books={books}
                loading={loading}
                error={error}
                genres={genres}
                selectedGenre={selectedGenre}
                onGenreChange={setSelectedGenre}
                onAddToFavorites={addFavorite} // Add this prop
              />
            ) : (
              <>
                <RecommendationsSection 
                  favoriteBooks={favoriteBooks}
                  onAddToFavorites={addFavorite}
                />
                <HomePage onGenreSelect={handleGenreSelect} />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
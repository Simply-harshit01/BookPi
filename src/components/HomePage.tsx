import React from 'react';
import { GenreSection } from './GenreSection';

const FEATURED_GENRES = [
  'Fiction',
  'Mystery',
  'Science Fiction',
  'Romance',
  'Self-Help',
  'Poetry',
  'Biography',
  'Business',
  'Short Stories',
  'Psychology'
];

export function HomePage({ onGenreSelect }: { onGenreSelect: (genre: string) => void }) {
  return (
    <div className="space-y-12">
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Discover Your Next Favorite Book
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Explore our curated collection of books across popular genres
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {FEATURED_GENRES.map(genre => (
          <GenreSection
            key={genre}
            genre={genre}
            onViewMore={() => onGenreSelect(genre)}
          />
        ))}
      </div>
    </div>
  );
}
import React from 'react';

interface GenreFilterProps {
  genres: string[];
  selectedGenre: string;
  onGenreChange: (genre: string) => void;
}

export function GenreFilter({ genres, selectedGenre, onGenreChange }: GenreFilterProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onGenreChange('')}
        className={`px-4 py-2 rounded-full text-sm ${
          selectedGenre === '' 
            ? 'bg-blue-500 text-white' 
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        All
      </button>
      {genres.map((genre) => (
        <button
          key={genre}
          onClick={() => onGenreChange(genre)}
          className={`px-4 py-2 rounded-full text-sm ${
            selectedGenre === genre 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}
import { Book } from '../types/book';
import { searchBooks } from './googleBooks';

export async function getRecommendations(favoriteBooks: Book[]): Promise<Book[]> {
  // Extract unique authors and genres from favorite books
  const authors = [...new Set(favoriteBooks.map(book => book.author))];
  const genres = [...new Set(favoriteBooks.map(book => book.genre))];
  
  // Get recommendations based on similar authors and genres
  const recommendations = await Promise.all([
    ...authors.map(author => searchBooks(`inauthor:${author}`, 3)),
    ...genres.map(genre => searchBooks(`subject:${genre}`, 3))
  ]);
  
  // Flatten results and remove duplicates and books already in favorites
  const flatResults = recommendations.flat();
  const favoriteIds = new Set(favoriteBooks.map(book => book.id));
  
  return flatResults.filter(book => 
    !favoriteIds.has(book.id)
  ).slice(0, 12); // Limit to 12 recommendations
}
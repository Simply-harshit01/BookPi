const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';

export async function searchBooks(query: string, maxResults = 9) {
  const response = await fetch(
    `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
  );
  const data = await response.json();
  return data.items?.map(formatBookData) || [];
}

export async function getBooksByGenre(genre: string, maxResults = 4) {
  return searchBooks(`subject:${genre}`, maxResults);
}

function formatBookData(item: any) {
  const volumeInfo = item.volumeInfo;
  return {
    id: item.id,
    title: volumeInfo.title,
    author: volumeInfo.authors?.[0] || 'Unknown Author',
    coverUrl: volumeInfo.imageLinks?.thumbnail || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400',
    genre: volumeInfo.categories?.[0] || 'Uncategorized',
    rating: volumeInfo.averageRating || 0,
    description: volumeInfo.description || 'No description available'
  };
}
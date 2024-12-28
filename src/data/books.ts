import { Book } from '../types/book';

export const books: Book[] = [
  {
    id: '1',
    title: 'The Midnight Library',
    author: 'Matt Haig',
    coverUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400',
    genre: 'Fiction',
    rating: 4.5,
    description: 'Between life and death there is a library, and within that library, the shelves go on forever.'
  },
  {
    id: '2',
    title: 'Atomic Habits',
    author: 'James Clear',
    coverUrl: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=400',
    genre: 'Self-Help',
    rating: 4.8,
    description: 'A proven framework for improving every day through tiny changes in behavior.'
  },
  {
    id: '3',
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    coverUrl: 'https://images.unsplash.com/photo-1614544048536-0d28caf77f41?auto=format&fit=crop&q=80&w=400',
    genre: 'Science Fiction',
    rating: 4.7,
    description: 'A lone astronaut must save humanity from a looming extinction event.'
  }
];
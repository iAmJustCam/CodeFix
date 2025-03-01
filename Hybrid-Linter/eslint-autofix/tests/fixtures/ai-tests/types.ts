// types.ts
export interface CardProps {
  title: string;
  content: string; // This was previously named 'description'
  imageUrl?: string;
  onClick?: () => void;
}
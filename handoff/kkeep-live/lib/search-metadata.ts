import type {Metadata} from 'next';

export const SITE_NAME = 'Kkeep fun';
export const SITE_URL = 'https://kkeep.fun';
export const SITE_DESCRIPTION = 'Kkeep fun brings Movie, Games, YouTube, and GeForce NOW together in one place.';

export function searchMetadata(path: string, title: string, description: string): Metadata {
  const url = SITE_URL + path;
  return {
    title,
    description,
    alternates: {canonical: url},
    robots: {index: true, follow: true},
    openGraph: {type: 'website', siteName: SITE_NAME, title, description, url},
    twitter: {card: 'summary', title, description},
  };
}

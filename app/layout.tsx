import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://ngrl-wedding-seat.kwonelena.chatgpt.site'),
  title: '너굴릴라 웨딩 자리배치도',
  description: '너굴릴라 웨딩 하객 명단과 23개 원탁 자리배치도',
  openGraph: {
    title: '너굴릴라 웨딩 자리배치도',
    description: '하객 명단을 한눈에 보고 원탁별 좌석을 편하게 정해 보세요.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '너굴릴라 웨딩 자리배치도' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '너굴릴라 웨딩 자리배치도',
    description: '하객 명단을 한눈에 보고 원탁별 좌석을 편하게 정해 보세요.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}

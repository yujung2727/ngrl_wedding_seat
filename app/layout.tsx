import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://our-seats-wedding.kwonelena.chatgpt.site'),
  title: '우리의 자리 · 웨딩 테이블 플랜',
  description: '하객 명단을 한눈에 보고 원탁별 좌석을 편하게 정하는 웨딩 테이블 플래너',
  openGraph: {
    title: '우리의 자리 · 웨딩 테이블 플랜',
    description: '하객 명단을 한눈에 보고 원탁별 좌석을 편하게 정해 보세요.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '우리의 자리 웨딩 테이블 플랜' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '우리의 자리 · 웨딩 테이블 플랜',
    description: '하객 명단을 한눈에 보고 원탁별 좌석을 편하게 정해 보세요.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}

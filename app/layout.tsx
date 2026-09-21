import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://our-seats-wedding.kwonelena.chatgpt.site'),
  title: '준영 유정 결혼식 자리 배치도',
  description: '준영 유정 결혼식 하객 명단과 원탁별 좌석 배치도',
  openGraph: {
    title: '준영 유정 결혼식 자리 배치도',
    description: '하객 명단을 한눈에 보고 원탁별 좌석을 편하게 정해 보세요.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '준영 유정 결혼식 자리 배치도' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '준영 유정 결혼식 자리 배치도',
    description: '하객 명단을 한눈에 보고 원탁별 좌석을 편하게 정해 보세요.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '우리의 자리 · 웨딩 테이블 플랜',
  description: '하객 명단을 한눈에 보고 원탁별 좌석을 편하게 정하는 웨딩 테이블 플래너',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}

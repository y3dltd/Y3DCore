'use client';

import { NextUIProvider } from '@nextui-org/react';
import { useRouter } from 'next/navigation';
import React from 'react';
import '@nextui-org/react/styles.css';

interface Props {
  children: React.ReactNode;
}

export default function NextUIWrapper({ children }: Props) {
  const router = useRouter();
  return <NextUIProvider navigate={router.push}>{children}</NextUIProvider>;
}

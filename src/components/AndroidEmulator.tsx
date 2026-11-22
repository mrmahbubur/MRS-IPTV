import React from 'react';

interface AndroidEmulatorProps {
  children: React.ReactNode;
}

export default function AndroidEmulator({ children }: AndroidEmulatorProps) {
  return (
    <div className="flex flex-col w-full min-h-screen bg-gradient-to-br from-[#244231] via-[#4d7553] to-[#203a2c] font-sans text-white">
      {children}
    </div>
  );
}

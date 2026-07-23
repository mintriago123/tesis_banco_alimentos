import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-8 sm:px-6 sm:py-12">
      {/* Botón de inicio */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-24 z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:px-5 sm:py-2.5 sm:text-base"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="hidden sm:inline">Regresar al inicio</span>
          <span className="sm:hidden">Inicio</span>
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto">
        <div className="flex flex-col items-center mb-6 sm:mb-8">
          <div className="mb-2 rounded-full border border-blue-100 bg-white p-2 shadow-sm sm:mb-3 sm:p-3">
            <Image
              src="/favicon2.ico"
              alt="Logo del Banco de Alimentos"
              width={56}
              height={56}
              priority
              className="drop-shadow-xl sm:w-16 sm:h-16"
            />
          </div>
          <h1 className="px-4 text-center text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl md:text-3xl">
            Banco de Alimentos
          </h1>
          <p className="mt-1 px-4 text-center text-xs font-medium text-slate-600 sm:text-sm">
            Proyecto de Vinculación con la Sociedad &bull; ULEAM
          </p>
        </div>

        {/* Glassmorphism Card */}
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-lg sm:px-8 sm:py-10 md:p-10">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;

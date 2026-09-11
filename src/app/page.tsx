import Link from 'next/link';
import { Heart, Package, Truck, User, Users } from 'lucide-react';

const steps = [
  {
    title: 'Recolección',
    description: 'Recogemos alimentos excedentes de supermercados, restaurantes y productores locales.',
    icon: Package,
    iconClass: 'bg-emerald-50 text-emerald-700',
  },
  {
    title: 'Clasificación',
    description: 'Nuestros voluntarios clasifican y almacenan los alimentos siguiendo protocolos de calidad.',
    icon: Users,
    iconClass: 'bg-blue-50 text-blue-700',
  },
  {
    title: 'Distribución',
    description: 'Entregamos los alimentos a organizaciones y familias que más lo necesitan.',
    icon: Truck,
    iconClass: 'bg-orange-50 text-orange-700',
  },
];

const statistics = [
  ['1.3B', 'Toneladas de alimentos se desperdician anualmente'],
  ['800M', 'Personas pasan hambre en el mundo'],
  ['10K+', 'Familias ayudadas mensualmente'],
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-md" aria-label="Navegación principal">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 rounded-lg focus-visible:ring-blue-600">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700">
              <Heart aria-hidden="true" className="h-5 w-5 text-white" />
            </span>
            <span className="text-xl font-bold text-slate-950">Banco de Alimentos</span>
          </Link>
        </div>
      </nav>

      <main>
        <section className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Nutriendo vidas,
            <br className="hidden sm:block" />
            <span className="text-blue-700"> optimizando recursos</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
            Recolectamos alimentos que serán distribuidos entre quienes más lo necesitan. Únete a nuestra misión y sé parte de este gran cambio social.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 px-4 sm:flex-row sm:px-0">
            <Link href="/auth/registrar?rol=DONANTE" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 sm:text-base">
              <Heart aria-hidden="true" className="h-5 w-5" />
              Registrarse
            </Link>
            <Link href="/auth/iniciar-sesion" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-700 px-6 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-50 sm:text-base">
              <User aria-hidden="true" className="h-5 w-5" />
              Iniciar sesión
            </Link>
          </div>
        </section>

        <section className="bg-blue-800 py-14 text-white sm:py-20" aria-labelledby="impacto-title">
          <h2 id="impacto-title" className="sr-only">Nuestro impacto</h2>
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
            {statistics.map(([value, label]) => (
              <div key={value} className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center backdrop-blur-sm sm:p-8">
                <p className="text-4xl font-bold sm:text-5xl">{value}</p>
                <p className="mt-2 text-sm leading-6 text-blue-100 sm:text-base">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-8" aria-labelledby="como-funciona-title">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="como-funciona-title" className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">¿Cómo funciona nuestro banco de alimentos?</h2>
              <p className="mt-4 text-base text-slate-600 sm:text-lg">Un proceso simple y efectivo para maximizar el impacto social.</p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {steps.map(({ title, description, icon: Icon, iconClass }) => (
                <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                  <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${iconClass}`}>
                    <Icon aria-hidden="true" className="h-8 w-8" />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-slate-950">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 py-12 text-white sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600"><Heart aria-hidden="true" className="h-5 w-5" /></span>
                <h2 className="text-xl font-bold">Banco de Alimentos Solidarios</h2>
              </div>
              <Link href="/contribuyentes" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700">
                <Users aria-hidden="true" className="h-4 w-4" />
                Ver contribuyentes
              </Link>
            </div>
            <div>
              <h2 className="font-semibold">Participa</h2>
              <Link href="/auth/iniciar-sesion" className="mt-3 inline-block text-sm text-slate-300 hover:text-blue-300">Donar alimentos</Link>
            </div>
            <div>
              <h2 className="font-semibold">Contacto</h2>
              <address className="mt-3 space-y-2 text-sm not-italic text-slate-300">
                <p>info@bancodealimentos.org</p>
                <p>+1 (234) 567-890</p>
                <p>Calle Solidaridad #123, Ciudad</p>
              </address>
            </div>
          </div>
          <div className="mt-10 border-t border-slate-800 pt-8 text-center">
            <p className="font-semibold italic text-blue-300">&quot;Juntos nutrimos sueños, sembramos futuro.&quot;</p>
            <p className="mt-3 text-sm text-slate-400">Este proyecto fue desarrollado con compromiso social por estudiantes de la ULEAM.</p>
            <p className="mt-3 text-xs text-slate-500">© {new Date().getFullYear()} Banco de Alimentos ULEAM.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

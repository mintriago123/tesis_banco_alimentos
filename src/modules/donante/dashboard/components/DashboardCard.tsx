import Link from 'next/link';

interface DashboardCardProps {
  href: string;
  title: string;
  description: string;
  bgColor: string;
  hoverColor: string;
  textColor: string;
}

export function DashboardCard({
  href,
  title,
  description,
  bgColor,
  hoverColor,
  textColor,
}: DashboardCardProps) {
  const descriptionColor = textColor.includes('blue') ? 'text-blue-700' : 'text-emerald-700';

  return (
    <Link href={href} className={`${bgColor} ${hoverColor} block rounded-xl border p-4 shadow-sm transition hover:shadow`}>
      <h3 className={`text-lg font-semibold ${textColor}`}>{title}</h3>
      <p className={`text-sm ${descriptionColor}`}>{description}</p>
    </Link>
  );
}

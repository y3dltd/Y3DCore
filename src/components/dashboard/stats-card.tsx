import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  title: string
  value: string | number
  icon: React.ElementType
  description?: string
  color?: 'blue' | 'green' | 'purple' | 'red' | 'yellow' | 'indigo' | 'pink' | 'orange'
  className?: string
}

// Map color names to Tailwind border classes
const colorMap = {
  blue: 'border-blue-500',
  green: 'border-green-500',
  purple: 'border-purple-500',
  red: 'border-red-500',
  yellow: 'border-yellow-500',
  indigo: 'border-indigo-500',
  pink: 'border-pink-500',
  orange: 'border-orange-500',
}

export function StatsCard({ title, value, icon: IconComponent, description, color, className }: StatsCardProps) {
  const borderColorClass = color ? colorMap[color] : 'border-transparent'

  return (
    <Card className={cn('shadow-md', borderColorClass, 'border-l-4', 'dark:bg-zinc-800', 'w-[180px]', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <IconComponent className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="px-3 py-1 pb-3">
        <div className="text-xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground pt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

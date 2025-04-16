"use client";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Clock, Palette, Layers, Hourglass, Repeat } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";

export interface PrintQueueSummaryData {
  total_print_tasks: number;
  distinct_colors: number;
  plates_needed: number;
  total_print_time: number;
  estimated_color_changes: number;
}

// Convert time in minutes to hours and minutes
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

interface StatCardProps {
  title: string;
  value: number | string;
  tooltip: string;
  color: string;
  icon: React.ElementType;
  delay: number;
}

function StatCard({ title, value, tooltip, color, icon: Icon, delay }: StatCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.5, 
        ease: "easeOut",
        delay: delay 
      }}
      whileHover={{ 
        scale: 1.03,
        transition: { duration: 0.2 } 
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={`flex items-center gap-4 rounded-lg p-3 dark:bg-zinc-900 border-l-4 border-${color}-500 min-w-[180px] relative ${isHovered ? 'dark:bg-zinc-800 shadow-md' : ''}`}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex-1 cursor-pointer">
              <div className="text-sm font-medium text-muted-foreground">{title}</div>
              <motion.div 
                className={`text-3xl font-bold text-${color}-500`}
                initial={{ scale: 1 }}
                animate={{ scale: isHovered ? 1.05 : 1 }}
                transition={{ duration: 0.2 }}
              >
                {value}
              </motion.div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="flex-shrink-0">
        <motion.div
          animate={{ rotate: isHovered ? 360 : 0 }}
          transition={{ duration: 0.5 }}
        >
          <Icon className={`h-5 w-5 text-${color}-500`} />
        </motion.div>
      </div>
    </motion.div>
  );
}

export function PrintQueueSummary({ summary }: { summary: PrintQueueSummaryData }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.9, ease: "easeOut" }}
      className="mb-8"
    >
      <Card className="dark:bg-zinc-800/90 shadow-lg border-0 overflow-hidden backdrop-blur-sm">
        <motion.div 
          className="w-full h-1.5 bg-gradient-to-r from-blue-500 via-pink-500 to-yellow-500"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        ></motion.div>
        <div className="flex flex-wrap p-4 gap-4 justify-between items-stretch">
          <StatCard 
            title="Total Tasks" 
            value={summary.total_print_tasks} 
            tooltip="Total number of print tasks in the queue"
            color="yellow"
            icon={Clock}
            delay={0.1}
          />
          
          <StatCard 
            title="Distinct Colors" 
            value={summary.distinct_colors} 
            tooltip="Different colors needed for all prints"
            color="blue"
            icon={Palette}
            delay={0.2}
          />
          
          <StatCard 
            title="Plates Needed" 
            value={summary.plates_needed} 
            tooltip="Estimated plates needed for all prints"
            color="pink"
            icon={Layers}
            delay={0.3}
          />
          
          <StatCard 
            title="Est. Print Time" 
            value={formatTime(summary.total_print_time)} 
            tooltip={`Estimated total printing time: ${summary.total_print_time} minutes`}
            color="purple"
            icon={Hourglass}
            delay={0.4}
          />
          
          <StatCard 
            title="Color Changes" 
            value={summary.estimated_color_changes} 
            tooltip="Projected filament color changes needed"
            color="red"
            icon={Repeat}
            delay={0.5}
          />
        </div>
      </Card>
    </motion.div>
  );
}

/**
 * 数据可视化组件库
 * 
 * 提供常用的图表组件，用于展示各种数据
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ==================== 类型定义 ====================

export interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

export interface ChartProps {
  className?: string;
}

// ==================== 统计卡片 ====================

interface StatCardProps extends ChartProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  trend,
  className = '',
}: StatCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    
    const iconClass = "w-4 h-4";
    switch (trend) {
      case 'up':
        return <TrendingUp className={iconClass} />;
      case 'down':
        return <TrendingDown className={iconClass} />;
      default:
        return <Minus className={iconClass} />;
    }
  };

  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return 'text-green-600 dark:text-green-400';
      case 'down':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {value}
          </p>
          
          {(change !== undefined || changeLabel) && (
            <div className={`flex items-center gap-1 mt-2 ${getTrendColor()}`}>
              {getTrendIcon()}
              {change !== undefined && (
                <span className="text-sm font-medium">
                  {change > 0 ? '+' : ''}{change}%
                </span>
              )}
              {changeLabel && (
                <span className="text-sm">
                  {changeLabel}
                </span>
              )}
            </div>
          )}
        </div>
        
        {icon && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 进度条 ====================

interface ProgressBarProps extends ChartProps {
  label: string;
  value: number;
  max: number;
  color?: string;
  showPercentage?: boolean;
}

export function ProgressBar({
  label,
  value,
  max,
  color = 'bg-blue-600',
  showPercentage = true,
  className = '',
}: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100);

  return (
    <div className={className}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>
        {showPercentage && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {percentage.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ==================== 简单条形图 ====================

interface BarChartProps extends ChartProps {
  data: DataPoint[];
  height?: number;
  showValues?: boolean;
}

export function BarChart({
  data,
  height = 200,
  showValues = true,
  className = '',
}: BarChartProps) {
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-end justify-around gap-2" style={{ height }}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * 100;
          const color = item.color || 'bg-blue-600';

          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              {showValues && (
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {item.value}
                </span>
              )}
              <div
                className={`w-full ${color} rounded-t transition-all duration-300`}
                style={{ height: `${barHeight}%` }}
              />
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 饼图 ====================

interface PieChartProps extends ChartProps {
  data: DataPoint[];
  size?: number;
  showLegend?: boolean;
}

export function PieChart({
  data,
  size = 200,
  showLegend = true,
  className = '',
}: PieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = 0;

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  ];

  const slices = data.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;

    return {
      ...item,
      percentage,
      startAngle,
      endAngle: currentAngle,
      color: item.color || colors[index % colors.length],
    };
  });

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-center gap-8">
        {/* SVG饼图 */}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((slice, index) => {
            const radius = size / 2 - 10;
            const centerX = size / 2;
            const centerY = size / 2;
            
            const startAngleRad = (slice.startAngle - 90) * (Math.PI / 180);
            const endAngleRad = (slice.endAngle - 90) * (Math.PI / 180);
            
            const x1 = centerX + radius * Math.cos(startAngleRad);
            const y1 = centerY + radius * Math.sin(startAngleRad);
            const x2 = centerX + radius * Math.cos(endAngleRad);
            const y2 = centerY + radius * Math.sin(endAngleRad);
            
            const largeArcFlag = slice.endAngle - slice.startAngle > 180 ? 1 : 0;
            
            const pathData = [
              `M ${centerX} ${centerY}`,
              `L ${x1} ${y1}`,
              `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
              'Z',
            ].join(' ');

            return (
              <path
                key={index}
                d={pathData}
                fill={slice.color}
                className="transition-opacity hover:opacity-80"
              />
            );
          })}
        </svg>

        {/* 图例 */}
        {showLegend && (
          <div className="flex-1 space-y-2">
            {slices.map((slice, index) => (
              <div key={index} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                  {slice.label}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {slice.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 折线图 ====================

interface LineChartProps extends ChartProps {
  data: TimeSeriesPoint[];
  height?: number;
  color?: string;
  showGrid?: boolean;
}

export function LineChart({
  data,
  height = 200,
  color = '#3B82F6',
  showGrid = true,
  className = '',
}: LineChartProps) {
  if (data.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center justify-center h-48 text-gray-400">
          暂无数据
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const minValue = Math.min(...data.map(d => d.value), 0);
  const valueRange = maxValue - minValue || 1;

  const width = 800;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // 生成路径
  const points = data.map((point, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
    return { x, y, value: point.value };
  });

  const pathData = points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${point.x} ${point.y}`;
    })
    .join(' ');

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* 网格线 */}
        {showGrid && (
          <g className="opacity-20">
            {[0, 25, 50, 75, 100].map(percent => {
              const y = padding + (chartHeight * percent) / 100;
              return (
                <line
                  key={percent}
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke="currentColor"
                  className="text-gray-400"
                />
              );
            })}
          </g>
        )}

        {/* 区域填充 */}
        <path
          d={`${pathData} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`}
          fill={color}
          opacity="0.1"
        />

        {/* 线条 */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
          className="transition-all"
        />

        {/* 数据点 */}
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="4"
            fill={color}
            className="transition-all hover:r-6"
          >
            <title>{point.value}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

// ==================== 热力图 ====================

interface HeatmapCell {
  row: number;
  col: number;
  value: number;
  label?: string;
}

interface HeatmapProps extends ChartProps {
  data: HeatmapCell[];
  rows: number;
  cols: number;
  cellSize?: number;
}

export function Heatmap({
  data,
  rows,
  cols,
  cellSize = 40,
  className = '',
}: HeatmapProps) {
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 overflow-auto ${className}`}>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
        }}
      >
        {data.map((cell, index) => {
          const intensity = cell.value / maxValue;
          const opacity = 0.2 + intensity * 0.8;

          return (
            <div
              key={index}
              className="bg-blue-600 rounded flex items-center justify-center text-white text-xs font-medium transition-opacity hover:opacity-100"
              style={{
                gridRow: cell.row + 1,
                gridColumn: cell.col + 1,
                opacity,
              }}
              title={cell.label || `${cell.value}`}
            >
              {cell.value}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 环形进度 ====================

interface CircularProgressProps extends ChartProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}

export function CircularProgress({
  value,
  max,
  size = 120,
  strokeWidth = 8,
  color = '#3B82F6',
  label,
  className = '',
}: CircularProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <svg width={size} height={size}>
        {/* 背景圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        
        {/* 进度圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-500"
        />
        
        {/* 中心文字 */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-2xl font-bold fill-gray-900 dark:fill-white"
        >
          {percentage.toFixed(0)}%
        </text>
      </svg>
      
      {label && (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {label}
        </span>
      )}
    </div>
  );
}

console.log('[ChartComponents] ✅ Chart components loaded');

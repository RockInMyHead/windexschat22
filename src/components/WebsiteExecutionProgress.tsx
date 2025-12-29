import React from 'react';
import { CheckCircle, Circle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

type ExecutionStep = {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  error?: string;
};

type WebsiteExecutionProgressProps = {
  steps: ExecutionStep[];
  isVisible: boolean;
};

export const WebsiteExecutionProgress: React.FC<WebsiteExecutionProgressProps> = ({
  steps,
  isVisible
}) => {
  if (!isVisible) return null;

  const getStatusIcon = (status: ExecutionStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'active':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Circle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ExecutionStep['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-700';
      case 'active':
        return 'text-blue-700';
      case 'error':
        return 'text-red-700';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Создание сайта
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {getStatusIcon(step.status)}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${getStatusColor(step.status)}`}>
                {step.label}
              </div>
              {step.error && (
                <div className="text-xs text-red-600 mt-1">
                  {step.error}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

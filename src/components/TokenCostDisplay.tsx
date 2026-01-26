import { TokenCost } from "@/lib/openai";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, TrendingUp, TrendingDown } from "lucide-react";

interface TokenCostDisplayProps {
  tokenCost: TokenCost | null;
}

export const TokenCostDisplay = ({ tokenCost }: TokenCostDisplayProps) => {
  if (!tokenCost) return null;

  const formatCost = (cost: number) => {
    return `${cost.toFixed(2)} ₽`;
  };

  return (
    <Card className="p-3 mt-2 bg-muted/50 border-dashed">
      <div className="flex items-center gap-2 mb-2">
        <Coins className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Стоимость токенов</span>
        <Badge variant="outline" className="text-xs">
          {tokenCost.model}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-blue-500" />
            <span className="text-muted-foreground">Вход:</span>
          </div>
          <div className="font-mono text-xs">
            {tokenCost.inputTokens.toLocaleString()} токенов
          </div>
          <div className="font-mono text-xs text-blue-600">
            {formatCost(tokenCost.inputCost)}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" style={{ color: '#1e983a' }} />
            <span className="text-muted-foreground">Выход:</span>
          </div>
          <div className="font-mono text-xs">
            {tokenCost.outputTokens.toLocaleString()} токенов
          </div>
          <div className="font-mono text-xs" style={{ color: '#1e983a' }}>
            {formatCost(tokenCost.outputCost)}
          </div>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-dashed">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Всего:</span>
          <div className="text-right">
            <div className="font-mono text-xs">
              {tokenCost.totalTokens.toLocaleString()} токенов
            </div>
            <div className="font-mono text-xs font-semibold text-primary">
              {formatCost(tokenCost.totalCost)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
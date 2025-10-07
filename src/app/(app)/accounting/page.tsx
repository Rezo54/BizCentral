import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';

export default function AccountingPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
          <p className="text-muted-foreground">
            Manage accounting for small businesses, including income statements and tax.
          </p>
        </div>
         <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> New Entry
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Financial Management</CardTitle>
          <CardDescription>
            This section is under construction. Features for managing income statements, expenses, and taxes will be available here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center rounded-md border-2 border-dashed">
            <p className="text-muted-foreground">Coming Soon</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

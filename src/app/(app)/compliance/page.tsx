import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';

export default function CompliancePage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compliance</h1>
          <p className="text-muted-foreground">
            Track and ensure compliance with country-specific laws and regulations.
          </p>
        </div>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> New Regulation
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Regulatory Tracking</CardTitle>
          <CardDescription>
            This section is under construction. Features for tracking legal requirements and compliance deadlines will be available here.
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

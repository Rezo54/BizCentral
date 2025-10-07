import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';

export default function PeoplePage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">People</h1>
          <p className="text-muted-foreground">
            Manage HR functions, including payroll, leave requests, policies, and forms.
          </p>
        </div>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Employee
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Human Resources</CardTitle>
          <CardDescription>
            This section is under construction. Features for payroll, leave, and policy management will be available here.
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

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { MoreHorizontal, PlusCircle } from 'lucide-react';

const users = [
  {
    name: 'Olivia Martin',
    email: 'olivia.martin@email.com',
    role: 'Admin',
    status: 'Active',
    avatar: PlaceHolderImages.find((p) => p.id === 'user-avatar-1')?.imageUrl,
  },
  {
    name: 'Jackson Lee',
    email: 'jackson.lee@email.com',
    role: 'Super-User',
    status: 'Active',
    avatar: PlaceHolderImages.find((p) => p.id === 'user-avatar-2')?.imageUrl,
  },
  {
    name: 'Isabella Nguyen',
    email: 'isabella.nguyen@email.com',
    role: 'User',
    status: 'Active',
    avatar: PlaceHolderImages.find((p) => p.id === 'user-avatar-3')?.imageUrl,
  },
  {
    name: 'William Kim',
    email: 'will@email.com',
    role: 'User',
    status: 'Inactive',
    avatar: PlaceHolderImages.find((p) => p.id === 'user-avatar-4')?.imageUrl,
  },
  {
    name: 'Sofia Davis',
    email: 'sofia.davis@email.com',
    role: 'User',
    status: 'Active',
    avatar: PlaceHolderImages.find((p) => p.id === 'user-avatar-5')?.imageUrl,
  },
];

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage users and their roles in the system.
          </p>
        </div>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Add User
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>User List</CardTitle>
          <CardDescription>
            A list of all users in your organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.email}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.avatar} alt="Avatar" data-ai-hint="person"/>
                        <AvatarFallback>
                          {user.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid gap-0.5">
                        <span className="font-semibold">{user.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {user.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'Admin' ? 'default' : user.role === 'Super-User' ? 'secondary' : 'outline'}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.status === 'Active' ? 'secondary' : 'destructive'}>{user.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-haspopup="true"
                          size="icon"
                          variant="ghost"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem>Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

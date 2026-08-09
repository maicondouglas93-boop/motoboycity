import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { mockReportCategories } from '@/lib/mock-data';

export default function AdminReportsPage() {
  return (
    <div className="space-y-8">
      {mockReportCategories.map((category) => (
        <div key={category.title} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{category.title}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {category.reports.map((report) => (
              <Card key={report} className="cursor-pointer transition-colors hover:bg-accent">
                <CardContent className="flex items-center gap-3 py-4">
                  <FileText className="size-5 text-muted-foreground" />
                  <span className="text-sm font-medium">{report}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

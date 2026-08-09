import { Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { mockConfigCategories } from '@/lib/mock-data';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      {mockConfigCategories.map((category, index) => (
        <div key={index} className="space-y-3">
          {category.title && (
            <h2 className="text-sm font-semibold text-muted-foreground">{category.title}</h2>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {category.items.map((item) => (
              <Card key={item} className="cursor-pointer transition-colors hover:bg-accent">
                <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
                  <Settings className="size-5 text-muted-foreground" />
                  <span className="text-sm font-medium">{item}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

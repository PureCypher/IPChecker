export function LoadingSkeleton() {
  return (
    <section className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
        {/* Summary Card Skeleton */}
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="h-8 bg-dark-border rounded w-48 mb-2"></div>
              <div className="h-4 bg-dark-border rounded w-64"></div>
            </div>
            <div className="h-6 bg-dark-border rounded w-20"></div>
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-dark-border rounded w-72"></div>
            <div className="h-4 bg-dark-border rounded w-56"></div>
          </div>
        </div>

        {/* Threat Card Skeleton */}
        <div className="card">
          <div className="h-6 bg-dark-border rounded w-40 mb-4"></div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <div className="h-4 bg-dark-border rounded w-24"></div>
              <div className="h-6 bg-dark-border rounded w-32"></div>
            </div>
            <div className="flex justify-between">
              <div className="h-4 bg-dark-border rounded w-32"></div>
              <div className="h-4 bg-dark-border rounded w-16"></div>
            </div>
            <div className="grid grid-cols-4 gap-3 pt-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 bg-dark-border rounded"></div>
              ))}
            </div>
          </div>
        </div>

        {/* Provider Card Skeleton */}
        <div className="card">
          <div className="h-6 bg-dark-border rounded w-40 mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-dark-border rounded"></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

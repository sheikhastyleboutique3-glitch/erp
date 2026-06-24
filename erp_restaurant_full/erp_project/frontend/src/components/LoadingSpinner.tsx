export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-6 w-6', md: 'h-10 w-10', lg: 'h-16 w-16' }[size];
  return (
    <div className="flex items-center justify-center p-8">
      <div
        role="status"
        aria-label="Loading"
        className={`animate-spin rounded-full border-2 border-border border-t-accent ${s}`}
      />
    </div>
  );
}

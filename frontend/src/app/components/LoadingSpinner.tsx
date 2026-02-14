export function LoadingSpinner() {
  return (
    <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-red-950'>
      <div className='text-center'>
        <div className='inline-flex items-center justify-center w-20 h-20 bg-red-600 rounded-2xl mb-4 animate-pulse'>
          <svg
            className='w-12 h-12 text-white'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
          >
            <path d='M12 2L2 7l10 5 10-5-10-5z' />
            <path d='M2 17l10 5 10-5' />
            <path d='M2 12l10 5 10-5' />
          </svg>
        </div>
        <p className='text-white font-semibold'>Loading ScarletSpots...</p>
      </div>
    </div>
  );
}

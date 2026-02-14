import { Card } from './ui/card';
import { MapPin, Users, Clock } from 'lucide-react';

interface ParkingStatsProps {
  totalLots: number;
  totalAvailable: number;
  friendsParked: number;
}

export function ParkingStats({ totalLots, totalAvailable, friendsParked }: ParkingStatsProps) {
  return (
    <div className='grid grid-cols-3 gap-2'>
      <Card className='bg-zinc-900/50 backdrop-blur-sm border-zinc-800 p-3'>
        <div className='flex flex-col items-center text-center'>
          <MapPin className='w-5 h-5 text-red-500 mb-1' />
          <p className='text-2xl font-bold text-white'>{totalLots}</p>
          <p className='text-xs text-zinc-400'>Lots</p>
        </div>
      </Card>

      <Card className='bg-zinc-900/50 backdrop-blur-sm border-zinc-800 p-3'>
        <div className='flex flex-col items-center text-center'>
          <Clock className='w-5 h-5 text-green-500 mb-1' />
          <p className='text-2xl font-bold text-white'>{totalAvailable}</p>
          <p className='text-xs text-zinc-400'>Available</p>
        </div>
      </Card>

      <Card className='bg-zinc-900/50 backdrop-blur-sm border-zinc-800 p-3'>
        <div className='flex flex-col items-center text-center'>
          <Users className='w-5 h-5 text-blue-500 mb-1' />
          <p className='text-2xl font-bold text-white'>{friendsParked}</p>
          <p className='text-xs text-zinc-400'>Friends</p>
        </div>
      </Card>
    </div>
  );
}

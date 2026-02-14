import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { MapPin, Bell, ChevronRight } from 'lucide-react';

export default function Intro() {
    const navigate = useNavigate();

    const handleContinue = () => {
        // In a real app, this would request permissions
        // For now, we simulate the flow
        navigate('/map');
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-red-900/20 to-transparent" />
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-red-600/10 rounded-full blur-3xl" />

            <div className="z-10 w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">

                {/* Branding */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 shadow-xl shadow-red-900/20 mb-6">
                        <span className="text-4xl">🚗</span>
                    </div>
                    <h1 className="text-4xl font-bold text-white tracking-tight">ScarletSpots</h1>
                    <p className="text-zinc-400">Smart parking for Rutgers Knights</p>
                </div>

                {/* Permissions Card */}
                <Card className="bg-zinc-900/80 backdrop-blur-md border-zinc-800 p-6 space-y-6">
                    <h3 className="text-xl font-semibold text-white text-center">Allow Permissions</h3>
                    <p className="text-zinc-400 text-center text-sm">
                        Please enable location and notifications to find the best spots and get real-time alerts.
                    </p>

                    <div className="space-y-4">
                        <div className="flex items-center gap-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                            <div className="p-2 rounded-full bg-red-600/20 text-red-500">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <p className="text-white font-medium">Location</p>
                                <p className="text-xs text-zinc-500">To find nearby parking lots</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                            <div className="p-2 rounded-full bg-red-600/20 text-red-500">
                                <Bell className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <p className="text-white font-medium">Notifications</p>
                                <p className="text-xs text-zinc-500">For parking alerts and availability</p>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Action Button */}
                <Button
                    onClick={handleContinue}
                    className="w-full h-12 text-lg bg-white text-black hover:bg-zinc-200 hover:text-black transition-all shadow-lg shadow-white/10 group"
                >
                    Continue
                    <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
            </div>

            {/* Footer */}
            <div className="absolute bottom-6 text-center">
                <p className="text-xs text-zinc-600">
                    By continuing, you verify that you are a Rutgers student or faculty member.
                </p>
            </div>
        </div>
    );
}

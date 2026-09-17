import React from 'react';
import AppLayout from '../layouts/AppLayout';
import DistanceChatbot from '../components/DistanceChatbot';
import { Compass, Sparkles } from 'lucide-react';
import './DistanceBotPage.css';

export default function DistanceBotPage() {
  return (
    <AppLayout title="Distance & Route AI">
      <div className="page-wrap distpage">
        <div className="distpage__hero">
          <div className="distpage__icon">
            <Compass size={32} />
          </div>
          <h1 className="distpage__title">Pujo Distance AI</h1>
          <p className="distpage__desc">
            Calculate instant walking & driving distances, discover closest pandals from your GPS location, and optimize multi-stop routes across Kolkata.
          </p>
        </div>

        {/* Embedded Active Chat Window */}
        <div className="distpage__chat-container">
          <DistanceChatbot defaultOpen={true} />
        </div>
      </div>
    </AppLayout>
  );
}

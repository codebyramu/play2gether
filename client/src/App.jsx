import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import BigScreen from './components/BigScreen';
import PhoneController from './components/PhoneController';
import './index.css';

function Home() {
  const navigate = useNavigate();
  return (
    <div className="home-container">
      <h1 className="home-title">PlayTogether</h1>
      <div className="btn-container">
        <button className="btn btn-tv" onClick={() => navigate('/tv')}>
          <span className="emoji">📺</span>
          Big Screen
        </button>
        <button className="btn btn-phone" onClick={() => navigate('/play')}>
          <span className="emoji">📱</span>
          Phone Controller
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tv" element={<BigScreen />} />
        <Route path="/play" element={<PhoneController />} />
      </Routes>
    </Router>
  );
}

export default App;

import {redirect} from 'next/navigation';

// Old setup links now open the game directly, without another tutorial.
export default function ControlsPage(){redirect('/?cloud=ghost');}

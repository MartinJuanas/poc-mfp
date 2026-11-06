import { Icon } from './UI';
import { categoryStyle, categoryName } from '../utils/categoryPresentation';
export default function CategoryBadge({ category }) {
  const [icon,tone] = categoryStyle(category);
  return <span className={`category-chip tone-${tone}`}><Icon name={icon} size={16}/>{categoryName(category)}</span>;
}
